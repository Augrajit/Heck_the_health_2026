import type { PubMedArticle } from '../lib/pubmedApi';

interface Props {
  articles: PubMedArticle[];
  loading: boolean;
}

export function PubMedSidebar({ articles, loading }: Props) {
  return (
    <div className="flex flex-col gap-3" id="pubmed-sidebar">
      <div className="flex items-center gap-2 mb-1">
        <svg width="14" height="14" fill="none" stroke="#06b6d4" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#06b6d4' }}>
          Clinical Literature
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-2">
          <div className="animate-spin-slow w-3 h-3 rounded-full"
            style={{ border: '2px solid rgba(6,182,212,0.3)', borderTopColor: '#06b6d4' }} />
          <span className="text-xs" style={{ color: '#64748b' }}>Fetching from PubMed…</span>
        </div>
      )}

      {!loading && articles.length === 0 && (
        <p className="text-xs" style={{ color: '#475569' }}>
          No articles found. Try uploading a DICOM file first.
        </p>
      )}

      {articles.map((a) => (
        <div key={a.pmid} className="pubmed-card animate-fade-in">
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline leading-snug block mb-1"
            style={{ color: '#e2e8f0' }}
          >
            {a.title.length > 90 ? a.title.slice(0, 90) + '…' : a.title}
          </a>
          <p className="text-xs-mono mb-1" style={{ color: '#64748b' }}>
            {a.authors}{a.year ? ` · ${a.year}` : ''} · PMID {a.pmid}
          </p>
          {a.abstract && (
            <p className="text-xs leading-relaxed" style={{ color: '#475569' }}>
              {a.abstract}
            </p>
          )}
        </div>
      ))}

      <p className="text-xs mt-1" style={{ color: '#334155' }}>
        Powered by{' '}
        <a href="https://pubmed.ncbi.nlm.nih.gov/" target="_blank" rel="noopener noreferrer"
          style={{ color: '#06b6d4' }}>PubMed Open Access</a>
      </p>
    </div>
  );
}
