import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/lib/auth/AuthProvider'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { SignUp } from '@/pages/SignUp'
import { UserProfile } from '@/pages/user-profiles/UserProfile'
import { EditProfile } from '@/pages/user-profiles/EditProfile'
import { MyFriends } from '@/pages/social/MyFriends'
import { FindFriends } from '@/pages/social/FindFriends'
import { MyCommunities } from '@/pages/social/MyCommunities'
import { FindCommunities } from '@/pages/social/FindCommunities'
import { Settings } from '@/pages/Settings'
import { Tuner } from '@/pages/Tuner'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { ScenarioSearch } from '@/pages/ScenarioSearch'
import { MultiplayerConnect } from '@/pages/MultiplayerConnect'
import { PlayScenario } from '@/pages/PlayScenario'
import { EloLeaderboard } from '@/pages/EloLeaderboard'

/** Everything behind RequireAuth; /login and /signup are the only public routes. */
const PROTECTED_ROUTES = [
  { path: '/home', element: <Home /> },
  { path: '/profile', element: <UserProfile /> },
  { path: '/profile/edit_profile', element: <EditProfile /> },
  { path: '/friends/my_friends', element: <MyFriends /> },
  { path: '/friends/find_friends', element: <FindFriends /> },
  { path: '/friends/my_communities', element: <MyCommunities /> },
  { path: '/friends/find_communities', element: <FindCommunities /> },
  { path: '/settings', element: <Settings /> },
  { path: '/tuner', element: <Tuner /> },
  { path: '/scenario_editor', element: <ScenarioEditor /> },
  { path: '/scenario_search', element: <ScenarioSearch /> },
  { path: '/multiplayer_connect', element: <MultiplayerConnect /> },
  { path: '/play/:scenarioId', element: <PlayScenario /> },
  { path: '/leaderboards', element: <EloLeaderboard /> },
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
