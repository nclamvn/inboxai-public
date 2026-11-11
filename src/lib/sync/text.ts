/** Keep bounded stored previews valid Unicode when the boundary bisects an emoji. */
export function boundedText(value:string,max:number):string {
 const chunk=value.slice(0,max)
 return /[\uD800-\uDBFF]$/.test(chunk)?chunk.slice(0,-1):chunk
}
