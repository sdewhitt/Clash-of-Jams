import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { UserProfile } from '@/pages/UserProfile'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
