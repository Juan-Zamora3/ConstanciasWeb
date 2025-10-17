// src/components/AnimatedKpi.tsx
import { useEffect, useState } from "react"
import { motion, useAnimationControls } from "framer-motion"
import { Card } from "./ui/Card"

export default function AnimatedKpi({
  titulo,
  valor,
  icon,
  nota,
}: {
  titulo: string
  valor: number
  icon?: React.ReactNode
  nota?: string
}) {
  const [display, setDisplay] = useState(0)
  const controls = useAnimationControls()

  useEffect(() => {
    let start = 0
    const end = valor
    const duration = 800 // ms
    const step = 16
    const inc = (end - start) / (duration / step)
    const id = setInterval(() => {
      start += inc
      if (start >= end) {
        start = end
        clearInterval(id)
      }
      setDisplay(Math.round(start))
    }, step)
    controls.start({ opacity: [0, 1], y: [6, 0], transition: { duration: 0.4 } })
    return () => clearInterval(id)
  }, [valor, controls])

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{titulo}</p>
        {icon}
      </div>
      <motion.p animate={controls} className="mt-1 text-3xl font-extrabold tracking-tight">
        {display}
      </motion.p>
      {nota && <p className="text-xs text-gray-500 mt-1">{nota}</p>}
    </Card>
  )
}
