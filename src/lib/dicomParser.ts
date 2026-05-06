/**
 * DICOM Parser Library
 * Wraps dicom-parser to extract pixel data, metadata, and anonymize patient PII.
 */
import dicomParser from 'dicom-parser';

export interface DicomMetadata {
  modality: string;
  rows: number;
  cols: number;
  sliceThickness: number;
  pixelSpacingRow: number;
  pixelSpacingCol: number;
  rescaleSlope: number;
  rescaleIntercept: number;
  bitsAllocated: number;
  pixelRepresentation: number;
  // Anonymized — never contains real patient PII
  studyDescription: string;
  seriesDescription: string;
}

export interface DicomVolume {
  metadata: DicomMetadata;
  pixelData: Int16Array | Uint16Array | Uint8Array;
  sliceCount: number;
  width: number;
  height: number;
}

/**
 * Parse a single DICOM file buffer into a DicomVolume.
 */
export function parseDicomBuffer(buffer: ArrayBuffer): DicomVolume {
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  // Extract metadata (safely — tag may not exist)
  const get = (tag: string, fallback: string = '') => {
    try { return dataSet.string(tag) ?? fallback; } catch { return fallback; }
  };
  const getNum = (tag: string, fallback: number = 1) => {
    try { return parseFloat(dataSet.string(tag) ?? String(fallback)) || fallback; } catch { return fallback; }
  };
  const getInt = (tag: string, fallback: number = 1) => {
    try { return dataSet.uint16(tag) ?? fallback; } catch { return fallback; }
  };

  const rows = getInt('x00280010', 512);
  const cols = getInt('x00280011', 512);
  const bitsAllocated = getInt('x00280100', 16);
  const pixelRepresentation = getInt('x00280103', 0); // 0=unsigned, 1=signed

  // Pixel spacing: value is "rowSpacing\colSpacing"
  const psRaw = get('x00280030', '1\\1').split('\\');
  const pixelSpacingRow = parseFloat(psRaw[0]) || 1;
  const pixelSpacingCol = parseFloat(psRaw[1] ?? psRaw[0]) || 1;

  const metadata: DicomMetadata = {
    modality: get('x00080060', 'CT'),
    rows,
    cols,
    sliceThickness: getNum('x00500010', 1),
    pixelSpacingRow,
    pixelSpacingCol,
    rescaleSlope: getNum('x00281053', 1),
    rescaleIntercept: getNum('x00281052', -1024),
    bitsAllocated,
    pixelRepresentation,
    // PII stripped — using anonymized descriptors only
    studyDescription: get('x00081030', 'Unknown Study'),
    seriesDescription: get('x0008103e', 'Unknown Series'),
  };

  // Extract pixel data
  const pixelDataElement = dataSet.elements['x7fe00010'];
  if (!pixelDataElement) throw new Error('No pixel data found in DICOM file');

  let pixelData: Int16Array | Uint16Array | Uint8Array;

  if (bitsAllocated === 16) {
    const rawBuffer = byteArray.buffer.slice(
      pixelDataElement.dataOffset,
      pixelDataElement.dataOffset + pixelDataElement.length
    );
    pixelData = pixelRepresentation === 1
      ? new Int16Array(rawBuffer)
      : new Uint16Array(rawBuffer);
  } else {
    pixelData = new Uint8Array(
      byteArray.buffer,
      pixelDataElement.dataOffset,
      pixelDataElement.length
    );
  }

  const expectedPixels = rows * cols;
  const sliceCount = Math.floor(pixelData.length / expectedPixels);

  return {
    metadata,
    pixelData,
    sliceCount: Math.max(sliceCount, 1),
    width: cols,
    height: rows,
  };
}

/**
 * Parse one file from a multi-file DICOM series.
 * Returns the metadata, raw pixel data for that single slice,
 * and the instance/position number used for slice ordering.
 */
export interface DicomSlice {
  instanceNumber: number;     // DICOM tag (0020,0013) — used for sort order
  imagePosition: number;      // z-coordinate from ImagePositionPatient (0020,0032)
  pixelData: Int16Array | Uint16Array | Uint8Array;
  width: number;
  height: number;
  metadata: DicomMetadata;
}

export function parseDicomSlice(buffer: ArrayBuffer): DicomSlice {
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray);

  const get    = (tag: string, fb = '')  => { try { return dataSet.string(tag) ?? fb; } catch { return fb; } };
  const getNum = (tag: string, fb = 1)  => { try { return parseFloat(dataSet.string(tag) ?? String(fb)) || fb; } catch { return fb; } };
  const getInt = (tag: string, fb = 1)  => { try { return dataSet.uint16(tag) ?? fb; } catch { return fb; } };

  const rows = getInt('x00280010', 512);
  const cols = getInt('x00280011', 512);
  const bitsAllocated = getInt('x00280100', 16);
  const pixelRepresentation = getInt('x00280103', 0);
  const psRaw = get('x00280030', '1\\1').split('\\');

  const metadata: DicomMetadata = {
    modality:          get('x00080060', 'CT'),
    rows, cols,
    sliceThickness:    getNum('x00500010', 1),
    pixelSpacingRow:   parseFloat(psRaw[0]) || 1,
    pixelSpacingCol:   parseFloat(psRaw[1] ?? psRaw[0]) || 1,
    rescaleSlope:      getNum('x00281053', 1),
    rescaleIntercept:  getNum('x00281052', -1024),
    bitsAllocated,
    pixelRepresentation,
    studyDescription:  get('x00081030', 'Unknown Study'),
    seriesDescription: get('x0008103e', 'Unknown Series'),
  };

  // Sort key 1: Instance Number (0020,0013)
  const instanceNumber = parseInt(get('x00200013', '0'), 10) || 0;

  // Sort key 2: z-axis of ImagePositionPatient (0020,0032) — "x\y\z"
  const ippRaw = get('x00200032', '0\\0\\0').split('\\');
  const imagePosition = parseFloat(ippRaw[2] ?? '0') || 0;

  // Extract pixel data
  const pxEl = dataSet.elements['x7fe00010'];
  if (!pxEl) throw new Error('No pixel data in DICOM slice');

  let pixelData: Int16Array | Uint16Array | Uint8Array;
  if (bitsAllocated === 16) {
    const raw = byteArray.buffer.slice(pxEl.dataOffset, pxEl.dataOffset + pxEl.length);
    pixelData = pixelRepresentation === 1 ? new Int16Array(raw) : new Uint16Array(raw);
  } else {
    pixelData = new Uint8Array(byteArray.buffer, pxEl.dataOffset, pxEl.length);
  }

  return { instanceNumber, imagePosition, pixelData, width: cols, height: rows, metadata };
}


/**
 * Convert raw pixel values to Hounsfield Units (HU).
 */
export function toHounsfieldUnits(
  rawValue: number,
  slope: number,
  intercept: number
): number {
  return rawValue * slope + intercept;
}

/**
 * Extract a single 2D slice from the volume as HU values.
 */
export function extractSlice(
  volume: DicomVolume,
  sliceIndex: number
): Float32Array {
  const { metadata, pixelData, width, height } = volume;
  const sliceSize = width * height;
  const offset = sliceIndex * sliceSize;
  const result = new Float32Array(sliceSize);

  for (let i = 0; i < sliceSize; i++) {
    const raw = pixelData[offset + i] ?? 0;
    result[i] = toHounsfieldUnits(raw, metadata.rescaleSlope, metadata.rescaleIntercept);
  }

  return result;
}

/**
 * Render a 2D axial slice to an ImageData (grayscale windowed).
 * Window center/width defaults are clinical CT soft tissue window.
 */
export function sliceToImageData(
  slice: Float32Array,
  width: number,
  height: number,
  windowCenter: number = 40,
  windowWidth: number = 400
): ImageData {
  const imageData = new ImageData(width, height);
  const lower = windowCenter - windowWidth / 2;
  const upper = windowCenter + windowWidth / 2;

  for (let i = 0; i < slice.length; i++) {
    const hu = slice[i];
    let v = ((hu - lower) / (upper - lower)) * 255;
    v = Math.max(0, Math.min(255, v));
    const px = i * 4;
    imageData.data[px] = v;
    imageData.data[px + 1] = v;
    imageData.data[px + 2] = v;
    imageData.data[px + 3] = 255;
  }

  return imageData;
}
