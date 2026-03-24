"""LangGraph workflow definition — wires all nodes with conditional edges."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from synapse_agent.nodes.knowledge_graph import knowledge_graph
from synapse_agent.nodes.quality_gate import quality_gate
from synapse_agent.nodes.query_analyzer import query_analyzer
from synapse_agent.nodes.ranker import ranker
from synapse_agent.nodes.searcher import searcher
from synapse_agent.nodes.synthesizer import synthesizer
from synapse_agent.state import ResearchState


def _should_continue_searching(state: ResearchState) -> str:
    """After KG build: loop back to search if gaps exist and iterations remain."""
    gaps = state.get("knowledge_gaps", [])
    iteration = state.get("search_iteration", 0)
    max_iter = state.get("max_iterations", 3)

    if gaps and iteration < max_iter:
        return "search_more"
    return "synthesize"


def _should_revise(state: ResearchState) -> str:
    """After quality gate: revise if not passed and revisions remain."""
    if state.get("quality_passed", False):
        return "done"
    return "revise"


def build_graph():
    """Build and compile the research workflow graph."""
    workflow = StateGraph(ResearchState)

    # Add nodes
    workflow.add_node("query_analyzer", query_analyzer)
    workflow.add_node("searcher", searcher)
    workflow.add_node("ranker", ranker)
    workflow.add_node("knowledge_graph", knowledge_graph)
    workflow.add_node("synthesizer", synthesizer)
    workflow.add_node("quality_gate", quality_gate)

    # Linear edges
    workflow.set_entry_point("query_analyzer")
    workflow.add_edge("query_analyzer", "searcher")
    workflow.add_edge("searcher", "ranker")
    workflow.add_edge("ranker", "knowledge_graph")

    # Conditional: after KG, either search more or synthesize
    workflow.add_conditional_edges(
        "knowledge_graph",
        _should_continue_searching,
        {
            "search_more": "searcher",
            "synthesize": "synthesizer",
        },
    )

    # After synthesis, evaluate quality
    workflow.add_edge("synthesizer", "quality_gate")

    # Conditional: after quality gate, either revise or finish
    workflow.add_conditional_edges(
        "quality_gate",
        _should_revise,
        {
            "revise": "synthesizer",
            "done": END,
        },
    )

    return workflow.compile()
