import { useNavigate } from "react-router"

export function BackButton() {
    const navigate = useNavigate()

    return (
        <button
            onClick={() => navigate(-1)}
            className={`
                bg-linear-to-b
                from-contrast-start
                from-50
                via-contrast-middle
                to-contrast-end
                to-70
                outline-3
                outline-contrast-middle
                hover:brightness-125
                hover:-translate-x-1
                active:scale-95
                text-ink
                text-xl
                font-bold
                px-4
                py-2
                rounded-xl
                cursor-pointer
                transition-all
                duration-200
                aria-label="To Previous Page"
            `}
        >
            ⬅
        </button>
    );
}