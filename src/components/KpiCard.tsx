type Props = { titulo: string; valor: string | number; icon?: React.ReactNode; nota?: string }

export default function KpiCard({ titulo, valor, icon, nota }: Props) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-200 p-4 hover:shadow md:transition">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{titulo}</p>
        {icon}
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight">{valor}</p>
      {nota && <p className="text-xs text-gray-500 mt-1">{nota}</p>}
    </div>
  )
}
