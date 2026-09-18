import { BrowserRouter, Route, Routes } from 'react-router'

import { AppLayout } from '@/components/layout/AppLayout'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { NotFound } from '@/pages/NotFound'
import { Play } from '@/pages/Play'
import { Profile } from '@/pages/Profile'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { ScenarioSearch } from '@/pages/ScenarioSearch'
import { Settings } from '@/pages/Settings'
import { SignUp } from '@/pages/SignUp'
import { Welcome } from '@/pages/Welcome'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public — no app chrome. */}
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Signed-in screens share the sidebar shell. */}
        <Route element={<AppLayout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/scenarios" element={<ScenarioSearch />} />
          <Route path="/editor" element={<ScenarioEditor />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Gameplay owns the full viewport, so it sits outside the shell. */}
        <Route path="/play/:scenarioId" element={<Play />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
