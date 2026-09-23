import { useNavigate } from "react-router"

export function BackButton() {
    const navigate = useNavigate()

    return (
        <button
            onClick={() => navigate(-1)}
            className={`
                bg-contrast
                outline-3
                outline-contrast-soft
                hover:outline-contrast
                hover:bg-contrast-soft
                hover:-translate-x-1
                active:scale-95
                text-ink
                text-xl
                font-bold
                px-4
                py-2
                rounded-xl
                transition-all
                duration-200
                aria-label="To Previous Page"
            `}
        >
            ⬅
        </button>
    );
}