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
    for (const line of input) {
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

const lines: string[] = [];
import * as readline from 'readline';
const rl = readline.createInterface(process.stdin);
rl.on('line', line => {
	lines.push(line);
}).on('close', () => {
	console.log(vizBlocks(extractBlocks(lines)));
	process.exit(0);
});
