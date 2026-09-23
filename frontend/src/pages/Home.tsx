import { useNavigate } from "react-router"
import { NavButton } from "@/components/NavButton";
import { ProfileButton } from "@/components/ProfileButton"

export function Home() {
  const navigate = useNavigate()

  function navPortal(location: string) {
    navigate(location)
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="flex items-center justify-between bg-accent-base border-b-2 border-accent pt-6 pb-6">
        <h1 className="ml-12 text-4xl font-bold">Clash of Jams</h1>
        <div className="mr-6">
          <ProfileButton
            username="Steve"
            userAvatar="../../favicon.svg"
          />
        </div>
      </header>

      <div className="px-6 flex-1 min-h-0 flex items-center">
        <div className="w-full grid grid-cols-[1fr_2fr] gap-12 max-h-full">
          
          <nav className="flex flex-col gap-6 justify-center">
            <NavButton onClick={() => navPortal('/scenario_search')}>Solo Play</NavButton>

            <NavButton onClick={() => navPortal('/multiplayer_connect')}>Online Play</NavButton>

            <NavButton onClick={() => navPortal('/scenario_editor')}>Scenario Editor</NavButton>

            <NavButton onClick={() => navPortal('/tuner')}>Tuner</NavButton>

            <NavButton onClick={() => navPortal('/settings')}>Settings</NavButton>
          </nav>

          <section className="aspect-video w-full rounded-xl border-3 border-accent bg-accent-base overflow-hidden">
            <img
              src="../../favicon.svg"
              alt="Clash of Jams Preview"
              className="w-full h-full object-cover"
            />
          </section>

        </div>
      </div>
    </main>
  )
}