/** Discard pre-drag/in-drag read payloads; refresh AFTER the deliberate move settles. */
export class PipelineDragOrder {
  private version = 0
  private ranks: Map<string,number> | null = null
  private deferred = false
  get active() { return this.ranks !== null }
  requestVersion() { return this.version }
  start(cards: readonly {id:string}[]) {
    this.version++
    this.ranks=new Map(cards.map((card,index)=>[card.id,index]))
  }
  accept(version: number) {
    if(this.active || version!==this.version) { this.deferred=true; return false }
    return true
  }
  sort<T extends {id:string}>(cards: T[]): T[] | null {
    const ranks=this.ranks
    if(!ranks)return null
    return [...cards].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity))
  }
  release() {
    this.ranks=null
    this.version++
    const refresh=this.deferred
    this.deferred=false
    return refresh
  }
}
