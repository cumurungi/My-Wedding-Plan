import type { MouseEventHandler } from 'react';
import darkLogo from './images/the_eventnest.png';
import lightLogo from './images/the_eventnest_light.png';

export default function Brand({ href = '#home', className = '', onClick }: {
  href?: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return <a className={`brand ${className}`.trim()} href={href} onClick={onClick}>
    <img className="brand-logo brand-logo-light" src={lightLogo} alt="The EventNest — Plan. Organize. Celebrate." />
    <img className="brand-logo brand-logo-dark" src={darkLogo} alt="" aria-hidden="true" />
  </a>;
}
