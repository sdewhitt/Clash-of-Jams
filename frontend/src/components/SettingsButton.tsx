type SettingsButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
};

export function SettingsButton({children, onClick,}: SettingsButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`
                bg-accent
                hover:bg-accent-middle
                hover:-translate-y-1
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