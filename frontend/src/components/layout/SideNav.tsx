import { NavLink } from 'react-router'

import { cn } from '@/lib/cn'
import { currentUser } from '@/lib/mockData'

const links = [
  { to: '/home', label: 'Home' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/editor', label: 'Editor' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
]

export function SideNav() {
  return (
    <nav
      aria-label="Main"
      className="flex w-56 shrink-0 flex-col border-r border-line bg-surface p-4"
    >
      <NavLink to="/home" className="mb-8 block px-2 text-lg font-semibold tracking-tight">
        Clash <span className="text-accent">of</span> Jams
      </NavLink>

      <ul className="flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent/15 font-medium text-accent-soft'
                    : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto rounded-panel border border-line bg-surface-2 p-3">
        <p className="text-sm font-medium">{currentUser.displayName}</p>
        <p className="text-xs text-muted">
          {currentUser.rank} &middot; {currentUser.elo} ELO
        </p>
      </div>
    </nav>
  )
}
