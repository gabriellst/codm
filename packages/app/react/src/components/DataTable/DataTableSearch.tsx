import { type ComponentProps } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@codm/app-ui/input-group'
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch'
import { useDataTable } from './DataTable'
import { cn } from '@/lib/utils'

interface DataTableSearchProps extends ComponentProps<typeof InputGroup> {
	placeholder?: string
}

export function DataTableSearch({ placeholder, className, ...props }: DataTableSearchProps) {
	const { config } = useDataTable()
	const { inputValue, handleSearchChange } = useDebouncedSearch({
		initialValue: config.search,
		onSearch: config.onSearchChange,
	})

	return (
		<InputGroup className={cn(className)} {...props}>
			<InputGroupAddon>
				<IconSearch className="size-4" />
			</InputGroupAddon>
			<InputGroupInput placeholder={placeholder} value={inputValue} onChange={e => handleSearchChange(e.target.value)} />
		</InputGroup>
	)
}
