import { isBlock, isConstructorDeclaration } from "typescript";

class Opcode {
    constructor(public op: string) {}
}
class Label {
    constructor(public label: string) {}
}
type Statement = Label | Opcode;
/**
 * blocks can be entered in one of two ways
 * - label above it
 * - branch above it
 */
class Block {
    flow: Block | undefined;
    branch: Block | undefined;
    constructor(
        public contents: string[],
        public label: string,
        public dead: boolean,
    ) {}
}

function isTerminator(line: string) {
    return line.match(/^(err|return)/);
}
function getLabelMaybe(line: string) {
    const colonIdx = line.split(' ')[0].indexOf(':');
    if (colonIdx < 0) return null;
    return line.slice(0, colonIdx);
}
function getBranchMaybe(line: string) {
    let match;
    if (match = /^(bnz|bz|b) (.*)/.exec(line)) {
        return [match[1], match[2]];
    }
    return null;
}

function getLabelFor(input: string[], label: string): number {
    const idx = input.findIndex(line => line.startsWith(label));
    if (idx === -1) throw new Error(`label not found: '${label}'`);
    return idx;
}


function extractBlocks(input: string[]) {
    type ConstructingBlock = {
        body: string[],
        label?: string,
        flow?: true | undefined,
        branch?: string,
        dead: boolean,
        realBlock?: Block,
    };
    let blocks: ConstructingBlock[] = [];
    // for turning branch destination names into pointers later
    const labels: {[k: string]: ConstructingBlock} = {};

    let curBlock: ConstructingBlock = {body: [], dead: false};
    for (const [index, line] of Object.entries(input)) {
        // labels are flown into from the previous block
        // labels exist at the start of a new block
        const label = getLabelMaybe(line);
        if (label) {
            curBlock.flow = true;
            blocks.push(curBlock);

            curBlock = {body: [], dead: false, label};
            curBlock.body.push(line);
            labels[label] = curBlock;
            continue;
        }

        curBlock.body.push(line);
        // unconditional branches have one exit, others have two
        const branch = getBranchMaybe(line);
        if (branch) {
            const flow = branch[0] !== 'b' || undefined;
            curBlock.flow = flow;
            curBlock.branch = branch[1];
            blocks.push(curBlock);
            // start a new block
            curBlock = {body: [], dead: !!flow}
            continue;
        }

        // terminators (err, return) end the block, anything after them is dead code
        if (isTerminator(line)) {
            console.error(`TERMINATOR: ${JSON.stringify(curBlock)}`)
            blocks.push(curBlock);
            curBlock = {body: [], dead: true};
            continue;
        }
    }
    blocks.push(curBlock);

    blocks = blocks.filter(block => block.body.length);
    
    const constructedBlocks = blocks.map((block, idx) => {
        const realBlock = new Block(block.body, block.label || `b${idx}`, block.dead)
        block.realBlock = realBlock;
        return realBlock;
    });
    // now put the links in and connect the branch pointers
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i - 1];
        if (block.flow) constructedBlocks[i - 1].flow = constructedBlocks[i];
        if (block.branch) {
            constructedBlocks[i - 1].branch = labels[block.branch]?.realBlock;
            if (!constructedBlocks[i - 1].branch) throw new Error(`branch target not found: '${block.branch}'`);
        }
    }
    return constructedBlocks;
}


function vizBlocks(blocks: Block[]) {
    const relations: string[] = [];
    const nodes: string[] = [];

    for (const block of blocks) {
        nodes.push(`${block.label} [shape=box label="<${block.label}>\\n${block.contents.join('\\n').replace(/"/g, '\'')}"]`)
        if (block.flow) relations.push(`${block.label} -> ${block.flow.label}`);
        if (block.branch) relations.push(`${block.label} -> ${block.branch.label}`);
    }

    return `digraph program {\n${nodes.join('\n')}\n\n${relations.join('\n')}\n\n}`;
}

console.log(vizBlocks(extractBlocks(
`txn OnCompletion
int NoOp
==
bnz l0
txn OnCompletion
int OptIn
==
bnz l1
txn OnCompletion
int CloseOut
==
bnz l2
txn OnCompletion
int UpdateApplication
==
bnz l3
txn OnCompletion
int DeleteApplication
==
bnz l4
err
l0:
txn ApplicationID
int 0
==
bnz l6
txna ApplicationArgs 0
byte "vote"
==
bnz l7
txna ApplicationArgs 0
byte "distribute"
==
bnz l8
txna ApplicationArgs 0
byte "startvote"
==
bnz l9
err
l6:
byte "phase"
int 1
app_global_put
int 1
b l10
l7:
txn NumAppArgs
int 2
==
int 0
byte "hasvote"
app_local_get
&&
txna ApplicationArgs 1
btoi
int 1
>=
txna ApplicationArgs 1
btoi
int 1
<=
&&
&&
bnz l11
int 0
b l12
l11:
int 0
byte "hasvote"
int 0
app_local_put
byte "VOTE:"
txna ApplicationArgs 1
concat
byte "VOTE:"
txna ApplicationArgs 1
concat
app_global_get
int 1
+
app_global_put
int 1
l12:
b l10
l8:
byte "phase"
app_global_get
int 1
!=
txn Sender
addr FA5HRSLW556MK5ETGG3FYKY7RV653I477L57J2VQGTVQ2OCDRLT6K4OKTU
==
&&
int 1
int 0
app_opted_in
&&
bnz l13
int 0
b l14
l13:
int 1
byte "hasvote"
int 1
app_local_put
int 1
l14:
b l10
l9:
byte "phase"
app_global_get
int 1
==
txn Sender
addr FA5HRSLW556MK5ETGG3FYKY7RV653I477L57J2VQGTVQ2OCDRLT6K4OKTU
==
&&
bnz l15
int 0
b l16
l15:
byte "phase"
int 2
app_global_put
int 1
l16:
l10:
b l5
l1:
byte "phase"
app_global_get
int 1
==
b l5
l2:
int 1
b l5
l3:
int 0
b l5
l4:
txn Sender
addr FA5HRSLW556MK5ETGG3FYKY7RV653I477L57J2VQGTVQ2OCDRLT6K4OKTU
==
l5:`.split('\n')
)))