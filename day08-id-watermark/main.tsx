import { ToolPage } from '@/components/tool-page'
import { mount } from '@/lib/mount'
import { toolBySlug } from '@/tools'
import { App } from './app'

mount(
  <ToolPage tool={toolBySlug('day08-id-watermark')}>
    <App />
  </ToolPage>,
)
