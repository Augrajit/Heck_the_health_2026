/**
 * PubMed eUtils API client — evidence-based literature for surgical context.
 */

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string;
  year: string;
  abstract: string;
  url: string;
}

const API_KEY = import.meta.env.VITE_PUBMED_API_KEY ?? '';
const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function apiParams(extra: Record<string, string> = {}) {
  const p: Record<string, string> = { ...extra };
  if (API_KEY) p['api_key'] = API_KEY;
  return new URLSearchParams(p).toString();
}

export async function fetchPubMedArticles(
  modality: string,
  studyDesc: string
): Promise<PubMedArticle[]> {
  const term = encodeURIComponent(
    `${modality} ${studyDesc} segmentation surgical planning`
  );
  try {
    // Step 1: search
    const searchUrl = `${BASE}/esearch.fcgi?${apiParams({
      db: 'pubmed', term, retmax: '5', retmode: 'json',
    })}`;
    const searchRes = await fetch(searchUrl);
    const searchJson = await searchRes.json();
    const ids: string[] = searchJson?.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    // Step 2: fetch summaries
    const summaryUrl = `${BASE}/esummary.fcgi?${apiParams({
      db: 'pubmed', id: ids.join(','), retmode: 'json',
    })}`;
    const summaryRes = await fetch(summaryUrl);
    const summaryJson = await summaryRes.json();
    const result = summaryJson?.result ?? {};

    return ids.slice(0, 3).map((id) => {
      const doc = result[id] ?? {};
      const authors = (doc.authors ?? [])
        .slice(0, 2)
        .map((a: { name: string }) => a.name)
        .join(', ');
      return {
        pmid: id,
        title: doc.title ?? 'Untitled',
        authors: authors || 'Unknown authors',
        year: (doc.pubdate ?? '').slice(0, 4),
        abstract: doc.source ?? '',
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });
  } catch {
    return [];
  }
}
