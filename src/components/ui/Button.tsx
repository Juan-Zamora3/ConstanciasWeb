import { motion, type HTMLMotionProps } from "framer-motion"

type Variants = "solid" | "ghost" | "outline"
type Sizes = "sm" | "md" | "lg"

type Props = HTMLMotionProps<"button"> & {
  variant?: Variants
  size?: Sizes
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl2 font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2"

const variants: Record<Variants, string> = {
  solid: "bg-tecnm-azul text-white hover:brightness-95 focus:ring-tecnm-azul",
  ghost: "bg-white/10 text-white hover:bg-white/20 focus:ring-white",
  outline: "border border-gray-200 hover:bg-gray-50 text-[#0f172a]",
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
  ...props
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -1 }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
