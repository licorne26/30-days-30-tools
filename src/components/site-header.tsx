import { Button } from '@/components/ui/button'
import { GithubIcon } from '@/components/github-icon'
import { ThemeToggle } from '@/components/theme-toggle'
import { REPO_URL, pageUrl } from '@/tools'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <a href={pageUrl()} className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-xs">30</span>
          30 天 30 个一句话工具
        </a>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild>
            <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub 源码">
              <GithubIcon />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
