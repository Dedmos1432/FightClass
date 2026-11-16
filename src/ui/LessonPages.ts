/** Short reading pages keep phone instructions readable without a scrolling panel. */
export function lessonPages(text:string,limit=110):string[] {
  const parts:string[]=[];
  for(const sentence of text.trim().match(/[^.!?]+(?:[.!?]+|$)/g)??[]) {
    const line=sentence.trim();if(!line)continue;
    if(line.length<=limit){parts.push(line);continue;}
    // Balance an unusually long sentence, keeping a few trailing words with their clause.
    const words=line.split(/\s+/),count=Math.ceil(line.length/limit),target=Math.ceil(line.length/count),chunks:string[]=[];
    let part='';
    while(words.length) {
      const word=words.shift()!;
      if(part && part.length+word.length+1>target && chunks.length+1<count){chunks.push(part);part='';}
      part+=(part?' ':'')+word;
    }
    if(part)chunks.push(part);parts.push(...chunks);
  }
  const pages:string[]=[];let page='';
  for(const part of parts){
    if(page && page.length+part.length+1>limit){pages.push(page);page='';}
    page+=(page?' ':'')+part;
  }
  if(page)pages.push(page);
  return pages.length?pages:[''];
}
