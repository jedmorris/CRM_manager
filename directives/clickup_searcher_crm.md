# ClickUp: Searcher CRM

> Default context for all ClickUp operations in this project.

## Scope

All ClickUp operations are scoped to the **Searcher CRM Template** space unless explicitly specified otherwise.

## Workspace Structure

| Entity | Type | ID |
|--------|------|-----|
| Searcher CRM Template | Space | `90136388839` |
| CRM | Folder | `90138143942` |
| Brokers | List | `901313227977` |
| Sellers | List | `901313229211` |

## Common Operations

### View all brokers
Search or get tasks from the Brokers list (`901313227977`).

### View all sellers
Search or get tasks from the Sellers list (`901313229211`).

### Add a broker
Create task in Brokers list with broker contact info.

### Add a seller
Create task in Sellers list with seller/deal info.

## Notes

- Workspace ID is auto-detected by the MCP connection
- When user asks about "tasks" without specifying, default to searching both Brokers and Sellers lists
- This directive was created to persist context across sessions
