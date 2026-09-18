import { Outlet } from 'react-router'

import { SideNav } from '@/components/layout/SideNav'

/** Shell for the signed-in screens. Gameplay renders outside this on purpose. */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <main className="flex-1 overflow-x-hidden px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
