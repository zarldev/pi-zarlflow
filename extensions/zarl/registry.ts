export type ZarlCommandContext = any;

export interface ZarlSubcommand {
	description: string;
	usage?: string;
	handler: (args: string, ctx: ZarlCommandContext) => Promise<void> | void;
}

const KEY = Symbol.for("zarldev.pi-zarlflow.commands");

type Registry = Map<string, ZarlSubcommand>;

function registry(): Registry {
	const globalWithRegistry = globalThis as typeof globalThis & { [KEY]?: Registry };
	if (!globalWithRegistry[KEY]) globalWithRegistry[KEY] = new Map();
	return globalWithRegistry[KEY];
}

export function registerZarlSubcommand(name: string, command: ZarlSubcommand): void {
	registry().set(name, command);
}

export function getZarlSubcommands(): Registry {
	return registry();
}
