import { forwardRef } from "react"
import { motion, type HTMLMotionProps } from "framer-motion"

type CardProps = HTMLMotionProps<"div">

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = "", children, ...rest },
  ref
) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .35, ease: "easeOut" }}
      className={`rounded-xl3 bg-white border border-gray-100 shadow-soft ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  )
})
