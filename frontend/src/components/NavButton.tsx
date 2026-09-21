type NavButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

export function NavButton({children, onClick, className = "",}: NavButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`
                bg-accent
                hover:bg-accent-soft
                hover:-translate-y-1
                active:scale-95
                text-ink
                text-xl
                font-bold
                px-8
                py-4
                rounded-xl
                transition-all
                duration-200
                ${className}
            `}
        >
            {children}
        </button>
    );
}