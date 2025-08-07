# Architecture Overview

This document provides a comprehensive technical overview of the Todoist Context Bridge plugin architecture, including core components, data flow, and system design principles.

## System Architecture

### High-Level Overview

The plugin follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Plugin (main.ts)                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Settings &    │  │   Command       │  │   Lifecycle     │ │
│  │   UI Layer      │  │   Registration  │  │   Management    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Core Services Layer                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Enhanced Sync  │  │  Change         │  │  Journal        │ │
│  │  Service        │  │  Detector       │  │  Manager        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Foundation Layer                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Todoist API    │  │  Text Parsing   │  │  File System    │ │
│  │  Integration    │  │  & Utilities    │  │  Operations     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Main Plugin (main.ts)

**Purpose**: Central orchestrator and lifecycle manager

**Responsibilities**:

- Plugin initialization and cleanup
- Command registration and routing
- Service instantiation and dependency injection
- Settings management and persistence
- Event listener registration

**Key Methods**:

- `onload()`: Plugin initialization
- `onunload()`: Cleanup and resource deallocation
- `addCommands()`: Command registration
- `initializeJournalMaintenance()`: Journal system setup

### 2. Enhanced Bidirectional Sync Service

**Purpose**: Advanced sync engine with journal-based tracking

**Location**: `EnhancedBidirectionalSyncService.ts`

**Responsibilities**:

- Intelligent task change detection
- Five-category task prioritization
- Bidirectional completion sync
- Journal-based state management
- Performance optimization

**Key Features**:

- Content hashing for change detection
- Conservative API usage patterns
- Retry logic with exponential backoff
- Real-time sync progress tracking

### 3. Change Detector

**Purpose**: Task discovery and change monitoring

**Location**: `ChangeDetector.ts`

**Responsibilities**:

- Vault scanning for linked tasks
- Task content change detection
- New task discovery
- Journal validation and healing
- File modification tracking

**Optimization Features**:

- Incremental file scanning
- Content hash comparison
- Bulk task fetching
- Smart filtering algorithms

### 4. Sync Journal Manager

**Purpose**: Persistent state tracking and data management

**Location**: `SyncJournalManager.ts`

**Responsibilities**:

- Journal file operations (read/write/backup)
- Task entry management
- Data migration and versioning
- Backup and restore operations
- Corruption detection and recovery

**Data Management**:

- JSON-based persistence
- Atomic file operations
- Backup rotation
- Schema validation

### 5. Todoist API Integration

**Purpose**: Todoist service communication

**Location**: `TodoistAPI.ts`

**Responsibilities**:

- REST API communication
- Authentication handling
- Rate limiting and retry logic
- Response parsing and error handling
- V1/V2 ID compatibility

**API Operations**:

- Task CRUD operations
- Project and label management
- Bulk data fetching
- Completion status updates

### 6. Text Parsing & Utilities

**Purpose**: Content processing and format handling

**Location**: `TextParsing.ts`

**Responsibilities**:

- Task format recognition
- Content extraction and parsing
- Link pattern matching
- Timestamp formatting
- Block reference handling

**Supported Formats**:

- Standard markdown tasks
- Numbered lists
- Callouts and quotes
- Various completion markers

## Data Flow Architecture

### 1. Task Sync Flow
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Obsidian  │    │   Plugin    │    │   Todoist   │
│    Tasks    │◄──►│   Journal   │◄──►│    API      │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Content   │    │   State     │    │  Remote     │
│   Changes   │    │  Tracking   │    │   State     │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 2. Change Detection Process

1. **File Monitoring**: Real-time file modification detection
2. **Content Analysis**: Hash-based change detection
3. **State Comparison**: Journal vs current state comparison
4. **Priority Assessment**: Five-category classification
5. **Sync Decision**: Determine if sync is needed
6. **Operation Execution**: Perform sync operations
7. **Journal Update**: Record changes and results

### 3. Journal Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Plugin     │    │  Journal    │    │  Backup     │
│  Startup    │───►│  Loading    │───►│  Creation   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Validation │    │  Maintenance│    │  Recovery   │
│  & Healing  │◄──►│  Operations │◄──►│  Procedures │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Design Principles

### 1. Performance First

- **Lazy Loading**: Components initialized only when needed
- **Caching Strategy**: Intelligent caching with invalidation
- **Batch Operations**: Group API calls for efficiency
- **Smart Filtering**: Process only what needs attention

### 2. Reliability & Resilience

- **Error Recovery**: Graceful degradation and retry mechanisms
- **Data Integrity**: Atomic operations and consistency checks
- **Backup Strategy**: Automatic backups before destructive operations
- **Validation**: Continuous data validation and healing

### 3. User Experience

- **Non-Intrusive**: Background operations with minimal user interruption
- **Progressive Enhancement**: Core functionality works without advanced features
- **Clear Feedback**: Informative progress and error messages
- **Configurable**: Extensive customization options

### 4. Maintainability

- **Modular Design**: Clear separation of concerns
- **Dependency Injection**: Loose coupling between components
- **Comprehensive Logging**: Detailed operation tracking
- **Documentation**: Extensive inline and external documentation

## State Management

### Journal-Based State Tracking

The plugin uses a persistent JSON journal to track:

```typescript
interface SyncJournal {
    tasks: Record<string, TaskEntry>;
    deletedTasks: Record<string, DeletedTaskEntry>;
    lastValidationTime?: number;
    version: string;
}

interface TaskEntry {
    obsidianFile: string;
    noteId?: string;
    todoistId: string;
    obsidianCompleted: boolean;
    todoistCompleted: boolean;
    obsidianContentHash: string;
    todoistContentHash: string;
    lastSyncTime: number;
    lastSyncOperation: number;
    completionState: CompletionState;
    orphaned?: boolean;
    deleted?: boolean;
}
```

### State Transitions

Tasks can transition between different states:

- **New**: Newly discovered tasks
- **Active**: Tasks being actively synced
- **Completed**: Tasks completed in one or both platforms
- **Orphaned**: Tasks with broken links
- **Deleted**: Tasks removed from one platform

## Performance Optimization

### Five-Category Task System

Tasks are classified into performance categories:

1. **High Priority**: Immediate sync required
2. **Medium Priority**: Regular interval sync
3. **Low Priority**: Infrequent sync (user configurable)
4. **Skip Category**: No sync required
5. **Deleted**: Preserved for reference only

### API Optimization Strategies

- **Conservative Checking**: Default to not checking unless necessary
- **Bulk Operations**: Group related API calls
- **Rate Limiting**: Respect Todoist API limits
- **Caching**: Cache responses to avoid redundant calls
- **Smart Intervals**: Adjust checking frequency based on activity

### Memory Management

- **Efficient Data Structures**: Optimized for lookup performance
- **Garbage Collection**: Proper cleanup of resources
- **Lazy Loading**: Load data only when needed
- **Memory Monitoring**: Track and optimize memory usage

## Security Considerations

### Data Protection

- **Local Storage**: All sync data stored locally in Obsidian
- **API Token Security**: Secure storage in Obsidian settings
- **No Third-Party Servers**: Direct communication with Todoist only
- **Data Encryption**: Leverages Obsidian's security model

### API Security

- **Token Validation**: Verify API token before operations
- **Rate Limiting**: Prevent abuse of Todoist API
- **Error Handling**: Secure error messages without token exposure
- **HTTPS Only**: All API communication over secure connections

## Extension Points

### Plugin Integration

The architecture supports integration with other Obsidian plugins:

- **Dataview**: Query sync data and completion states
- **Tasks**: Enhanced task management with sync integration
- **Task Marker**: Comprehensive timestamp tracking
- **Advanced URI**: Block-level linking and navigation

### Customization Options

- **Settings Interface**: Comprehensive configuration options
- **Command System**: Extensible command registration
- **Event System**: Hook into sync operations
- **Notification System**: Customizable user feedback

## Future Architecture Considerations

### Scalability

- **Database Migration**: Potential move to SQLite for large datasets
- **Distributed Sync**: Multi-device sync coordination
- **Plugin Ecosystem**: Enhanced integration with other plugins
- **Performance Monitoring**: Built-in performance analytics

### Feature Expansion

- **Additional Platforms**: Support for other task management services
- **Advanced Filtering**: More sophisticated task categorization
- **Workflow Automation**: Rule-based sync behaviors
- **Collaboration Features**: Team sync and sharing capabilities

This architecture provides a solid foundation for reliable, performant, and extensible task synchronization while maintaining simplicity and user-friendliness.
