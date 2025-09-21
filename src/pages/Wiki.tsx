import React, { useState, useEffect } from 'react';
import parse from 'html-react-parser';
import Header from '../components/basic/Header';
import '../components/WikiParser.css';


const Wiki: React.FC = () => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newOpenSections = new Set(openSections);
    if (newOpenSections.has(sectionId)) {
      newOpenSections.delete(sectionId);
    } else {
      newOpenSections.add(sectionId);
    }
    setOpenSections(newOpenSections);
  };

  useEffect(() => {
    const loadWikiContent = async () => {
      try {
        setLoading(true);
        const response = await fetch('/wiki/YabbyVilleWiki.html');
        
        if (!response.ok) {
          throw new Error(`Failed to load wiki file: ${response.status}`);
        }
        
        const htmlText = await response.text();
        
        // Extract just the body content from the Google Docs HTML
        const bodyMatch = htmlText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const contentToDisplay = bodyMatch ? bodyMatch[1] : htmlText;
        
        setHtmlContent(contentToDisplay);
        setError('');
      } catch (err) {
        console.error('Error loading wiki file:', err);
        setError('Failed to load wiki content');
      } finally {
        setLoading(false);
      }
    };

    loadWikiContent();
  }, []);

  // Process the HTML content to add collapsible functionality
  const processHtmlContent = (html: string) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Find all h1 elements and their content
    const h1Elements = tempDiv.querySelectorAll('h1, .c7');
    const sections: Array<{id: string, title: string, content: string}> = [];
    
    let currentSectionContent = '';
    let currentTitle = '';
    let sectionId = '';
    let titleElement: Element | null = null;
    
    // Get the title (first element)
    const titleElements = tempDiv.querySelectorAll('.title, .c16');
    const wikiTitle = titleElements.length > 0 ? titleElements[0].textContent || 'YabbyVille Wiki' : 'YabbyVille Wiki';
    
    Array.from(tempDiv.children).forEach((element, index) => {
      const isH1 = element.matches('h1') || element.classList.contains('c7');
      const isTitle = element.classList.contains('title') || element.querySelector('.c16');
      
      if (isTitle) {
        // Skip the main title
        return;
      }
      
      if (isH1) {
        // Save previous section if it exists
        if (currentTitle && currentSectionContent) {
          sections.push({
            id: sectionId,
            title: currentTitle,
            content: currentSectionContent
          });
        }
        
        // Start new section
        currentTitle = element.textContent || `Section ${sections.length + 1}`;
        sectionId = `section-${sections.length}`;
        currentSectionContent = '';
        titleElement = element;
      } else {
        // Add content to current section
        currentSectionContent += element.outerHTML;
      }
    });
    
    // Add the last section
    if (currentTitle && currentSectionContent) {
      sections.push({
        id: sectionId,
        title: currentTitle,
        content: currentSectionContent
      });
    }
    
    return { wikiTitle, sections };
  };

  const   sudo xcodebuild -licenserenderCollapsibleContent = () => {
    if (!htmlContent) return null;
    
    const { wikiTitle, sections } = processHtmlContent(htmlContent);
    
    return (
      <div className="wiki-collapsible">
        <div className="wiki-title-section">
          <h1 className="wiki-main-title">{wikiTitle}</h1>
        </div>
        
        {sections.map((section) => (
          <div key={section.id} className="wiki-section">
            <h1 
              className={`wiki-section-header ${openSections.has(section.id) ? 'open' : ''}`}
              onClick={() => toggleSection(section.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleSection(section.id);
                }
              }}
            >
              <span className="wiki-section-title">{section.title}</span>
              <span className="wiki-section-arrow">
                {openSections.has(section.id) ? '▼' : '▶'}
              </span>
            </h1>
            
            <div className={`wiki-section-content ${openSections.has(section.id) ? 'open' : 'collapsed'}`}>
              {parse(section.content)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Wiki" subtitle="How to use Yabby" />
        <div className="wiki-container">
          <div className="wiki-loading">Loading wiki...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <Header title="Wiki" subtitle="How to use Yabby" />
        <div className="wiki-container">
          <div className="wiki-error">
            <h3>Error Loading Wiki</h3>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Wiki" subtitle="How to use Yabby" />
      <div className="wiki-container">
        <div className="wiki-content">
          {renderCollapsibleContent()}
        </div>
      </div>
    </div>
  );
};

export default Wiki;