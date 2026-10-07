type SettingsButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
};

export function SettingsButton({children, onClick, active=false}: SettingsButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`
                relative
                px-8
                py-4
                rounded-xl
                cursor-pointer
                text-ink
                text-xl
                font-bold
                ${active ? `
                    bg-linear-to-b 
                    from-contrast-start from-50 
                    via-contrast-middle 
                    to-contrast-end to-70` 
                    : `
                    bg-linear-to-b 
                    from-accent-start from-50 
                    via-accent-middle 
                    to-accent-end to-70
                    transition-transform duration-200
                    before:absolute
                    before:inset-y-0
                    before:left-0
                    before:w-0
                    before:rounded-xl
                    before:bg-linear-to-b
                    before:from-contrast-start from-50
                    before:via-contrast-middle
                    before:to-contrast-end to-70
                    before:transition-all
                    before:duration-450
                    before:ease-out
                    hover:before:w-full
                `}
            `}
        >
            <span className="relative">
                {children}
            </span>
        </button>
    );
}