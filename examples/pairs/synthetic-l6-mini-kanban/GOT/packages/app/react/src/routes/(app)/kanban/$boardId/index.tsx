import { createFileRoute } from '@tanstack/react-router'
import { BoardSection } from './-components/BoardSection'

export const Route = createFileRoute('/(app)/kanban/$boardId/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6 md:p-8">
      <BoardSection />
    </div>
  )
}
