function log(name: string, ...args: any[]) {
    console.log(`[${name}]`, ...args)
}

export default log;