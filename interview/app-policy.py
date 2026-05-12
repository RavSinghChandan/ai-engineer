
def build_prompt(query,context):
    return f"""You are an HR Assistant Use Only the following context.context : {char(10).join(context)} Question : {query} """

def generate_answer(query,chunk):
    combined = " ".join(chunk)
    if "Sick leave" in query.lower():
        return "Based on the policy, Sick leave Eligibility is defined in the policy doc"
    return combined[:300]

@dataclass
class Chunk:
    chunk_id:str
    source_doc:str
    section:str
    subsection:str
    content:str
    medtadata:dict

class HRPolicyChunker:
    def __init__(
        self, 
        max_chunk_chars :int = 1200,
        overlap_chars : int = 200
    ):
        self.max_chunk_chars =  max_chunk_chars
        self.overlap_chars= overlap_chars
def chunk_document(self,text :str,source_doc :str) -> List[Chunk]:
    """ Main chunking Pipeline """
    final_chunks= []
    sections= self._split_by_section(text)
    subsection_chunks = self._split_subsection(
        section_content,
        section_titile,
        source_doc 
    )          
    final_chunks.exntend(subsection_chunks)

def _split_by_section (self,text:str) -> dict[str,str]:
    """ Spliting based on headings """
    section_pattern = r"\n [A-Z][A-Za-z\s]{3,50}\n" 
    matches = list(re.finditer(section_pattern))
    if not  matches :
        return {"General:" : text}
    secttions = {}

    for i , matches in enumerate(matches):
        title = matches.group(1).strip()
        start = matches.end()

        if i +1 < len(matches):
            end = matches[i+ 1].start()
        else:
            end = len(text)
        secttions [title]= text[start:end].strip()
    return secttions
def _split_subsection(
        self,
        content:str,
        section_title:str,
        source_doc:str
) -> List[Chunk]:
    """" Futher split by paragrah """
    paragraph =  re.split(r" \ns*\n",content)
    Chunks = []
    current_buffer = ""

    for para in paragraph:
        para = para.strip()
        if not para :
            continue
        if len(current_buffer) + len(para) < self.max_chunk_chars:
            current_buffer += "\n" + para
        else:
            Chunks.append (
                self.create_chunk(
                    current_buffer.strip(),
                    source_doc,
                    section_title,
                    "General"
                )
            )    
            overlap = current_buffer[-self.overlap_chars:]
            current_buffer  = overlap + "\n"+ para

    if current_buffer.strip():
        Chunks.append (
                self.create_chunk(
                    current_buffer.strip(),
                    source_doc,
                    section_title,
                    "General"
                )
            )  
    return Chunks    
