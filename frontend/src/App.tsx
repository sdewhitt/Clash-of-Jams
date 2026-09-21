import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { UserProfile } from '@/pages/UserProfile'
import { Settings } from '@/pages/Settings'
import { Tuner } from '@/pages/Tuner'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { ScenarioSearch } from '@/pages/ScenarioSearch'
import { MultiplayerConnect } from '@/pages/MultiplayerConnect'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/tuner" element={<Tuner />} />
        <Route path="/scenario_editor" element={<ScenarioEditor />} />
        <Route path="/scenario_search" element={<ScenarioSearch />} />
        <Route path="/multiplayer_connect" element={<MultiplayerConnect />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
