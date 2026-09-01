interface Window {
	showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
	values(): AsyncIterableIterator<FileSystemHandle>;
}

interface DataTransferItem {
	getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}
