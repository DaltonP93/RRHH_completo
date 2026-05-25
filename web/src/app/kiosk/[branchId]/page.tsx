import KioskPageClient from './KioskPageClient'

export default async function KioskPage({
  params,
}: {
  params: Promise<{ branchId: string }>
}) {
  const { branchId } = await params
  return <KioskPageClient branchId={branchId} />
}
