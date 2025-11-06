/* eslint-disable import/no-default-export */

declare module '*.md?raw' {
    const content: string;
    export default content;
}

declare module '*.txt?raw' {
    const content: string;
    export default content;
}
