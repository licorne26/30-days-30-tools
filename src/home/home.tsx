import { ArrowUpRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SiteHeader } from '@/components/site-header'
import { cn } from '@/lib/utils'
import { TOTAL_DAYS, X_URL, pageUrl, tools } from '@/tools'

const RULES = ['不要服务器', '不上传任何文件', '提示词和代码全部开源']

export function Home() {
  const done = new Map(tools.map((t) => [t.day, t]))

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <section className="space-y-4">
          <Badge variant="secondary">
            已完成 {tools.length} / {TOTAL_DAYS}
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            每天一句话，让 AI 做一个小工具
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg">连续 30 天。所有工具都直接在你的浏览器里运行。</p>
          <ul className="flex flex-wrap gap-2 pt-1">
            {RULES.map((r) => (
              <li key={r}>
                <Badge variant="outline" className="px-2.5 py-1 text-sm font-normal">
                  {r}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="挑战进度" className="mt-10 grid grid-cols-10 gap-1.5">
          {Array.from({ length: TOTAL_DAYS }, (_, i) => {
            const tool = done.get(i + 1)
            const cls = cn(
              'grid aspect-square place-items-center rounded-md text-xs tabular-nums transition-colors',
              tool ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground',
            )
            return tool ? (
              <a key={i} href={pageUrl(tool.slug)} className={cls} title={tool.title}>
                {i + 1}
              </a>
            ) : (
              <div key={i} className={cls}>
                {i + 1}
              </div>
            )
          })}
        </section>

        <section className="mt-12 space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium">全部工具</h2>
          {[...tools].reverse().map((t) => (
            <a key={t.slug} href={pageUrl(t.slug)} className="group block">
              <Card className="gap-2 py-5 transition-colors group-hover:bg-accent/50">
                <CardHeader className="px-5">
                  <CardTitle className="flex items-center gap-3">
                    <span className="text-muted-foreground font-mono text-xs">Day {String(t.day).padStart(2, '0')}</span>
                    {t.title}
                    <ArrowUpRight className="text-muted-foreground ml-auto size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
              </Card>
            </a>
          ))}
        </section>

        <footer className="text-muted-foreground mt-12 border-t pt-6 text-sm">
          想要什么工具？去{' '}
          <a href={X_URL} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
            X @la_licorne9
          </a>{' '}
          评论区点菜。
        </footer>
      </main>
    </div>
  )
}
