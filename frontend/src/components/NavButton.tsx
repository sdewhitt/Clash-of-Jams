type NavButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
};

export function NavButton({children, onClick,}: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`
                bg-linear-to-b
                from-accent-start from-50
                via-accent-middle
                to-accent-end to-70
                hover:brightness-125
                hover:-translate-y-1
                hover:drop-shadow-lg
                hover:drop-shadow-contrast-start
                active:scale-95
                text-ink
                text-xl
                font-bold
                px-8
                py-4
                rounded-xl
                cursor-pointer
                transition-all
                duration-200
            `}
        >
            {children}
        </button>
    );
}