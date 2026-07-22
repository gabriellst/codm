import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import {
  useCreateCard,
  createCardMutationRequestSchema,
  getBoardQueryKey,
} from '@template/client-typescript/typescript'
import { useDialogStore } from '@/stores/useDialogStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface CreateCardDialogProps {
  boardId: string
  listId: string
}

export function CreateCardDialog({ boardId, listId }: CreateCardDialogProps) {
  const { t } = useTranslation()
  const { hide } = useDialogStore()
  const queryClient = useQueryClient()

  const { mutate, isPending } = useCreateCard({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getBoardQueryKey(boardId) })
        hide()
        toast.success(t('kanban.createCard.title'))
      },
    },
  })

  const form = useForm({
    defaultValues: { title: '', boardId, listId },
    validators: {
      onSubmit: createCardMutationRequestSchema,
    },
    onSubmit: ({ value }) => {
      mutate({ data: value })
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('kanban.createCard.title')}</DialogTitle>
        <DialogDescription>{t('kanban.createCard.description')}</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={e => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="flex flex-col gap-4 py-4"
      >
        <form.Field name="title">
          {field => (
            <Input
              placeholder={t('kanban.board.cardTitle')}
              value={field.state.value}
              onChange={e => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              disabled={isPending}
              aria-label={t('kanban.board.cardTitle')}
            />
          )}
        </form.Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={hide} disabled={isPending}>
            {t('kanban.createCard.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {t('kanban.createCard.submit')}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
