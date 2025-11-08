import React, { useState, useEffect } from 'react';
import parse, { domToReact } from 'html-react-parser';

interface WikiProps {
  htmlFile?: string; // Path to HTML file
  className?: string;
}

const WikiSimple: React.FC<WikiProps> = ({
  htmlFile = '/wiki/YabbyVilleWiki.html',
  className = '',
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadHtmlFile = async () => {
      try {
        setLoading(true);
        const response = await fetch(htmlFile);

        if (!response.ok) {
          throw new Error(`Failed to load wiki file: ${response.status}`);
        }

        const htmlText = await response.text();

        // Extract just the <body> if it's a full HTML doc
        const bodyMatch = htmlText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let contentToDisplay = bodyMatch ? bodyMatch[1] : htmlText;

        // 🧹 Clean HTML: remove inline styles and fixed widths/heights
        contentToDisplay = contentToDisplay
          .replace(/style="[^"]*"/gi, '') // remove inline style=""
          .replace(/\swidth="\d+"/gi, '') // remove width="123"
          .replace(/\sheight="\d+"/gi, ''); // remove height="123"

        setHtmlContent(contentToDisplay);
        setError('');
      } catch (err) {
        console.error('Error loading wiki file:', err);
        setError('Failed to load wiki content');
      } finally {
        setLoading(false);
      }
    };

    loadHtmlFile();
  }, [htmlFile]);

  const toggleSection = (sectionId: string) => {
    const newOpenSections = new Set(openSections);
    if (newOpenSections.has(sectionId)) {
      newOpenSections.delete(sectionId);
    } else {
      newOpenSections.add(sectionId);
    }
    setOpenSections(newOpenSections);
  };

  const processHtmlContent = (html: string) => {
    const options = {
      replace: (domNode: any) => {
        if (domNode.name === 'h1') {
          const sectionId = domNode.attribs?.id || `section-${Math.random()}`;
          const isOpen = openSections.has(sectionId);

          return (
            <div className="wiki-section">
              <h1
                className={`wiki-section-header ${isOpen ? 'open' : ''}`}
                onClick={() => toggleSection(sectionId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleSection(sectionId);
                  }
                }}
              >
                <span className="wiki-section-title">{domToReact(domNode.children)}</span>
                <span className="wiki-section-arrow">{isOpen ? '▼' : '▶'}</span>
              </h1>
              <div className={`wiki-section-content ${isOpen ? 'open' : 'collapsed'}`}>
                {domToReact(domNode.nextSibling ? [domNode.nextSibling] : [])}
              </div>
            </div>
          );
        }

        if (domNode.name === 'table') {
          // Wrap tables in a scrollable container
          return (
            <div style={{ overflowX: 'auto' }}>
              {domToReact(domNode.children)}
            </div>
          );
        }

        if (domNode.name === 'pre') {
          // Ensure preformatted text wraps instead of overflowing
          return (
            <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              {domToReact(domNode.children)}
            </pre>
          );
        }

        if (domNode.name === 'img') {
          // Ensure images are responsive
          return (
            <img
              {...domNode.attribs}
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
                margin: '0 auto',
              }}
            />
          );
        }
      },
    };

    return parse(html, options);
  };

  if (loading) {
    return (
      <div className={`wiki-container ${className}`}>
        <div className="wiki-loading">Loading wiki...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`wiki-container ${className}`}>
        <div className="wiki-error">
          <h3>Error Loading Wiki</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`wiki-container ${className}`}>
      <div className="wiki-content">{processHtmlContent(htmlContent)}</div>
    </div>
  );
};

export default WikiSimple;
