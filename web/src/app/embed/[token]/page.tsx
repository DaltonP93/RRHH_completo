import EmbedPageClient from './EmbedPageClient'

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <EmbedPageClient token={token} />
}
