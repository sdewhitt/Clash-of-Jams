import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/lib/auth/AuthProvider'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { SignUp } from '@/pages/SignUp'
import { UserProfile } from '@/pages/UserProfile'
import { MyFriends } from '@/pages/friends/MyFriends'
import { FindFriends } from '@/pages/friends/FindFriends'
import { Settings } from '@/pages/Settings'
import { Tuner } from '@/pages/Tuner'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { ScenarioSearch } from '@/pages/ScenarioSearch'
import { MultiplayerConnect } from '@/pages/MultiplayerConnect'

/** Everything behind RequireAuth; /login and /signup are the only public routes. */
const PROTECTED_ROUTES = [
  { path: '/home', element: <Home /> },
  { path: '/profile', element: <UserProfile /> },
  { path: '/friends/my_friends', element: <MyFriends /> },
  { path: '/friends/find_friends', element: <FindFriends /> },
  { path: '/settings', element: <Settings /> },
  { path: '/tuner', element: <Tuner /> },
  { path: '/scenario_editor', element: <ScenarioEditor /> },
  { path: '/scenario_search', element: <ScenarioSearch /> },
  { path: '/multiplayer_connect', element: <MultiplayerConnect /> },
]

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          {PROTECTED_ROUTES.map(({ path, element }) => (
            <Route key={path} path={path} element={<RequireAuth>{element}</RequireAuth>} />
          ))}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
