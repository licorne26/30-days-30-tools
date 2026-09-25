import { useState } from 'react'
import { ArrowLeft, Check, Copy } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GithubIcon } from '@/components/github-icon'
import { SiteHeader } from '@/components/site-header'
import { REPO_URL, TOTAL_DAYS, X_URL, pageUrl, type Tool } from '@/tools'

export function ToolPage({ tool, children }: { tool: Tool; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(tool.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the prompt is still visible to select by hand */
    }
  }

  return (
    <div className="min-h-svh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <a
          href={pageUrl()}
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          全部工具
        </a>

        <div className="mb-8 space-y-3">
          <Badge variant="secondary">
            Day {tool.day} / {TOTAL_DAYS}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.title}</h1>
          <p className="text-muted-foreground max-w-2xl text-base">{tool.description}</p>
        </div>

        {children}

        <Card className="mt-12 gap-4">
          <CardHeader>
            <CardTitle className="text-base">那一句话</CardTitle>
            <CardDescription>这个工具就是用下面这一句话让 AI 做出来的。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="bg-muted rounded-md p-4 text-sm leading-relaxed">{tool.prompt}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyPrompt}>
                {copied ? <Check /> : <Copy />}
                {copied ? '已复制' : '复制提示词'}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`${REPO_URL}/tree/main/${tool.slug}`} target="_blank" rel="noreferrer">
                  <GithubIcon />
                  查看源码
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <footer className="text-muted-foreground mt-10 text-sm">
          明天做什么？去{' '}
          <a href={X_URL} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
            X @la_licorne9
          </a>{' '}
          评论区点菜。
        </footer>
      </main>
    </div>
  )
}
