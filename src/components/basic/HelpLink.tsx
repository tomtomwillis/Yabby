import { Link } from 'react-router-dom';
import './HelpLink.css';

interface HelpLinkProps {
  to: string;
  title?: string;
}

function HelpLink({ to, title = 'Help' }: HelpLinkProps) {
  return (
    <Link to={to} className="help-link" title={title}>?</Link>
  );
}

export default HelpLink;
