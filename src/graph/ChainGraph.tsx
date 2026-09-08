// The chain itself. React Flow draws it; layout.ts places it and routes every
// edge; validate.ts decides which edges are drawn as fact and which are drawn
// as unverified.
import { createContext, useContext, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import AssetIcon from "./AssetIcon";
import {
  layoutChain,
  smoothPath,
  type ChainEdgeData,
  type ChainNodeData,
  type LayoutInput,
} from "./layout";
import type { Event } from "../types";

interface GraphActions {
  /** Stage or unstage isolating this asset. Nothing runs until Re-analyse. */
  onIsolate: (asset: string) => void;
  /** Stage or unstage blocking this step, by the drawn edge's id from uniqueEdgeIds. */
  onBlock: (edgeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  selectedEdgeId: string | null;
  /** False when the server has no key, or a call is already in flight. */
  canIntervene: boolean;
  /** Asset names and edgeKeys that are staged for the next analysis. */
  stagedKeys: ReadonlySet<string>;
  disabledReason: string;
}

const noop = () => undefined;

const ActionsContext = createContext<GraphActions>({
  onIsolate: noop,
  onBlock: noop,
  onSelectEdge: noop,
  selectedEdgeId: null,
  canIntervene: false,
  stagedKeys: new Set(),
  disabledReason: "",
});

function ChainNodeCard({ data }: NodeProps<ChainNodeData>) {
  const actions = useContext(ActionsContext);
  const staged = actions.stagedKeys.has(data.asset);
  return (
    <div className={`chain-node kind-${data.kind} status-${data.status} ${staged ? "staged" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="chain-node-body">
        <AssetIcon kind={data.kind} />
        <div className="chain-node-text">
          <span className="asset-name">{data.asset}</span>
          {data.label ? <span className="asset-label">{data.label}</span> : null}
        </div>
      </div>
      <button
        type="button"
        className={`node-action ${staged ? "staged" : ""}`}
        disabled={!actions.canIntervene}
        title={
          !actions.canIntervene
            ? actions.disabledReason
            : staged
              ? `Keep ${data.asset}'s events in the next analysis`
              : `Stage removing every event that touches ${data.asset}`
        }
        onClick={(event) => {
          event.stopPropagation();
          actions.onIsolate(data.asset);
        }}
      >
        {staged ? "Undo isolate" : "Isolate"}
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ChainEdgeLine(props: EdgeProps<ChainEdgeData>) {
  const actions = useContext(ActionsContext);
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } =
    props;

  // The route dagre planned, which starts and ends on the node borders and
  // passes through the label. React Flow's own bezier is only a fallback.
  const [path, labelX, labelY] = useMemo(() => {
    if (data && data.points.length >= 2) {
      return [smoothPath(data.points), data.label.x, data.label.y] as const;
    }
    return getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }, [data, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]);

  const edge = data?.edge;
  const status = data?.status ?? "survived";
  const verified = edge?.verified ?? false;
  const staged = data ? actions.stagedKeys.has(data.key) : false;
  const classes = [
    `role-${edge?.role ?? "chain"}`,
    `kind-${edge?.kind ?? "action"}`,
    verified ? "verified" : "unverified",
    `status-${status}`,
    actions.selectedEdgeId === id ? "selected" : "",
    staged ? "staged" : "",
  ].join(" ");

  return (
    <>
      <path
        id={id}
        d={path}
        markerEnd={markerEnd}
        className={`react-flow__edge-path chain-edge ${classes}`}
      />
      <path
        d={path}
        className="react-flow__edge-interaction"
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onClick={() => actions.onSelectEdge(id)}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${classes}`}
          style={{
            width: data?.label.width,
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <button
            type="button"
            className="edge-label-text"
            title={edge?.description}
            onClick={() => actions.onSelectEdge(id)}
          >
            {edge?.action}
            {edge?.kind === "data_out" ? <span className="tag data-out">data out</span> : null}
            {edge?.role === "notable" ? <span className="tag noted">noted</span> : null}
            {!verified && status !== "vanished" ? <span className="tag">unverified</span> : null}
            {status === "vanished" ? <span className="tag">gone</span> : null}
            {status === "appeared" ? <span className="tag new">new</span> : null}
          </button>
          <button
            type="button"
            className={`edge-action ${staged ? "staged" : ""}`}
            disabled={!actions.canIntervene}
            title={
              !actions.canIntervene
                ? actions.disabledReason
                : staged
                  ? "Keep this step's events in the next analysis"
                  : "Stage removing the events this step is built on"
            }
            onClick={(event) => {
              event.stopPropagation();
              actions.onBlock(id);
            }}
          >
            {staged ? "Undo block" : "Block"}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { chainNode: ChainNodeCard };
const edgeTypes = { chainEdge: ChainEdgeLine };

export interface ChainGraphProps extends GraphActions {
  chain: LayoutInput;
  events: Event[];
}

export default function ChainGraph({ chain, events, ...actions }: ChainGraphProps) {
  const { nodes, edges } = useMemo(() => layoutChain(chain, events), [chain, events]);
  const value = useMemo<GraphActions>(() => ({ ...actions }), [
    actions.onIsolate,
    actions.onBlock,
    actions.onSelectEdge,
    actions.selectedEdgeId,
    actions.canIntervene,
    actions.stagedKeys,
    actions.disabledReason,
  ]);

  // A new set of nodes or edges is a new picture: remount so React Flow fits
  // it to the pane again instead of leaving part of it off screen.
  const shape = useMemo(
    () => [...nodes.map((node) => node.id), ...edges.map((edge) => edge.id)].join("|"),
    [nodes, edges],
  );

  return (
    <ActionsContext.Provider value={value}>
      <ReactFlow
        key={shape}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.3}
        proOptions={{ hideAttribution: false }}
        onEdgeClick={(_, edge) => actions.onSelectEdge(edge.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={24} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </ActionsContext.Provider>
  );
}
