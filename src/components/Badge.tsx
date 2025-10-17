export default function Badge({
  children,
  color = 'gray',
}: {
  children: React.ReactNode
  color?: 'green' | 'yellow' | 'gray' | 'purple' | 'blue' | 'orange'
}) {
  const map: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-700',
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${map[color]}`}>
      {children}
    </span>
  )
}
