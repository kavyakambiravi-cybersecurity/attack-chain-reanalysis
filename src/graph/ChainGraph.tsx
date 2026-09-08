// The chain itself. React Flow draws it; layout.ts places it; validate.ts
// decides which edges are drawn as fact and which are drawn as unverified.
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
import { layoutChain, type ChainEdgeData, type ChainNodeData, type LayoutInput } from "./layout";
import type { Event } from "../types";

interface GraphActions {
  onIsolate: (asset: string) => void;
  onBlock: (edgeKey: string) => void;
  onSelectEdge: (edgeKey: string) => void;
  selectedEdgeKey: string | null;
  /** False when the server has no key, or a call is already in flight. */
  canIntervene: boolean;
  /** The node or edge whose intervention is running right now. */
  busyKey: string | null;
  disabledReason: string;
}

const noop = () => undefined;

const ActionsContext = createContext<GraphActions>({
  onIsolate: noop,
  onBlock: noop,
  onSelectEdge: noop,
  selectedEdgeKey: null,
  canIntervene: false,
  busyKey: null,
  disabledReason: "",
});

function Spinner() {
  return <span className="spinner" aria-label="working" />;
}

function ChainNodeCard({ data }: NodeProps<ChainNodeData>) {
  const actions = useContext(ActionsContext);
  const busy = actions.busyKey === data.asset;
  return (
    <div className={`chain-node kind-${data.kind} status-${data.status}`}>
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
        className="node-action"
        disabled={!actions.canIntervene}
        title={actions.canIntervene ? `Remove every event that touches ${data.asset}` : actions.disabledReason}
        onClick={(event) => {
          event.stopPropagation();
          actions.onIsolate(data.asset);
        }}
      >
        {busy ? <Spinner /> : "Isolate"}
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ChainEdgeLine(props: EdgeProps<ChainEdgeData>) {
  const actions = useContext(ActionsContext);
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } =
    props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const edge = data?.edge;
  const status = data?.status ?? "survived";
  const verified = edge?.verified ?? false;
  const state = status === "survived" ? (verified ? "verified" : "unverified") : status;
  const selected = actions.selectedEdgeKey === id;
  const busy = actions.busyKey === id;

  return (
    <>
      <path
        id={id}
        d={path}
        markerEnd={markerEnd}
        className={`react-flow__edge-path chain-edge state-${state} ${selected ? "selected" : ""}`}
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
          className={`edge-label state-${state} ${selected ? "selected" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <button type="button" className="edge-label-text" onClick={() => actions.onSelectEdge(id)}>
            {edge?.action}
            {!verified && status !== "vanished" ? <span className="tag">unverified</span> : null}
            {status === "vanished" ? <span className="tag">gone</span> : null}
            {status === "appeared" ? <span className="tag">new</span> : null}
          </button>
          <button
            type="button"
            className="edge-action"
            disabled={!actions.canIntervene}
            title={
              actions.canIntervene
                ? "Remove the events this step is built on"
                : actions.disabledReason
            }
            onClick={(event) => {
              event.stopPropagation();
              actions.onBlock(id);
            }}
          >
            {busy ? <Spinner /> : "Block"}
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
    actions.selectedEdgeKey,
    actions.canIntervene,
    actions.busyKey,
    actions.disabledReason,
  ]);

  return (
    <ActionsContext.Provider value={value}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: false }}
        onEdgeClick={(_, edge) => actions.onSelectEdge(edge.id)}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </ActionsContext.Provider>
  );
}
