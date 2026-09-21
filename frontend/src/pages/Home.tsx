import { useNavigate } from "react-router"
import { NavButton } from "../components/NavButton";

export function Home() {
  const navigate = useNavigate()

  function navPortal( location: string){
    navigate(location)
  }

  return (
    <main className="min-h-dvh flex flex-col px-6">
      <h1>Clash of Jams</h1>
      <div className="flex-1 flex flex-col justify-center">
        <div className="w-full max-w-xs flex flex-col gap-6">
          <NavButton onClick={() => navPortal('/scenario_search')}>Solo Play</NavButton>

          <NavButton onClick={() => navPortal('/multiplayer_connect')}>Online Play</NavButton>

          <NavButton onClick={() => navPortal('/scenario_editor')}>Scenario Editor</NavButton>

          <NavButton onClick={() => navPortal('/tuner')}>Tuner</NavButton>

          <NavButton onClick={() => navPortal('/settings')}>Settings</NavButton>
        </div>
      </div>
    </main>
  )
}
