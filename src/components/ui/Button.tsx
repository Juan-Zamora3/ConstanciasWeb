import { motion, type HTMLMotionProps } from "framer-motion"

type Variants = "solid" | "ghost" | "outline"
type Sizes = "sm" | "md" | "lg"

type Props = HTMLMotionProps<"button"> & {
  variant?: Variants
  size?: Sizes
}

/** Estilos base */
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl2 font-medium transition " +
  "focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none"

/** Variantes
 *  - solid: azul TecNM (como tu “primary”)
 *  - ghost: el mismo que ya tenías (para fondos oscuros)
 *  - outline: gris por defecto (puedes sobreescribir con className)
 */
const variants: Record<Variants, string> = {
  solid:
    "bg-tecnm-azul text-white hover:brightness-95 focus:ring-tecnm-azul",
  ghost:
    "bg-white/10 text-white hover:bg-white/20 focus:ring-white",
  outline:
    "border border-gray-200 hover:bg-gray-50 text-[#0f172a] focus:ring-gray-200",
}

const sizes: Record<Sizes, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5",
}

export default function Button({
  variant = "solid",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      whileHover={disabled ? undefined : { y: -1 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  )
}
