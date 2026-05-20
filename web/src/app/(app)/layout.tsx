import LayoutShell from '@/components/layout/LayoutShell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <LayoutShell>{children}</LayoutShell>
}
