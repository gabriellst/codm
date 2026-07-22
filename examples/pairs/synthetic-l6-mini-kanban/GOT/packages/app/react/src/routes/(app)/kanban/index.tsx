import { createFileRoute } from '@tanstack/react-router'
import { BoardsListSection } from './-components/BoardsListSection'

export const Route = createFileRoute('/(app)/kanban/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
      <BoardsListSection />
    </div>
  )
}
