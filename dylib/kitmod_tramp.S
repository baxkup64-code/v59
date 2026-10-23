.text
.macro KM_SAVE
    sub sp, sp, #0xA0
    stp x0, x1, [sp, #0]
    stp x2, x3, [sp, #16]
    stp x4, x5, [sp, #32]
    stp x6, x7, [sp, #48]
    str x8, [sp, #64]
    stp x29, x30, [sp, #72]
    stp d0, d1, [sp, #88]
    stp d2, d3, [sp, #104]
    stp d4, d5, [sp, #120]
    stp d6, d7, [sp, #136]
.endmacro
.macro KM_RESTORE
    ldp x0, x1, [sp, #0]
    ldp x2, x3, [sp, #16]
    ldp x4, x5, [sp, #32]
    ldp x6, x7, [sp, #48]
    ldr x8, [sp, #64]
    ldp x29, x30, [sp, #72]
    ldp d0, d1, [sp, #88]
    ldp d2, d3, [sp, #104]
    ldp d4, d5, [sp, #120]
    ldp d6, d7, [sp, #136]
    add sp, sp, #0xA0
.endmacro
// Register x\r = Binary-Base + \off
.macro KM_LOAD_BASE_PLUS r, off
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x16, #(\off & 0xffff)
    movk x16, #((\off >> 16) & 0xffff), lsl #16
    add  x\r, x17, x16
.endmacro
.macro KM_JUMP_BASE_PLUS off
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x16, #(\off & 0xffff)
    movk x16, #((\off >> 16) & 0xffff), lsl #16
    add  x16, x17, x16
    br   x16
.endmacro
.macro KM_BL_BASE_PLUS target, ret
    adrp x17, _kitmod_base@PAGE
    ldr  x17, [x17, _kitmod_base@PAGEOFF]
    movz x30, #(\\ret & 0xffff)
    movk x30, #((\\ret >> 16) & 0xffff), lsl #16
    add  x30, x17, x30
    movz x16, #(\\target & 0xffff)
    movk x16, #((\\target >> 16) & 0xffff), lsl #16
    add  x16, x17, x16
    br   x16
.endmacro

// ---- GameButtonCtor (RVA 0x9b900, plain) ----
.globl _km_tramp_0
.p2align 2
_km_tramp_0:
    KM_SAVE
    mov x0, #0
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xa9be4ff4
    KM_JUMP_BASE_PLUS 0x9b904
.globl _km_leave_0
.p2align 2
_km_leave_0:
    KM_SAVE
    mov x0, #0
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- TouchBegan (RVA 0x9bde8, plain) ----
.globl _km_tramp_1
.p2align 2
_km_tramp_1:
    KM_SAVE
    mov x0, #1
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xa9be4ff4
    KM_JUMP_BASE_PLUS 0x9bdec
.globl _km_leave_1
.p2align 2
_km_leave_1:
    KM_SAVE
    mov x0, #1
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- TouchEnded (RVA 0x9be50, plain) ----
.globl _km_tramp_2
.p2align 2
_km_tramp_2:
    KM_SAVE
    mov x0, #2
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0x5281fb68
    KM_JUMP_BASE_PLUS 0x9be54
.globl _km_leave_2
.p2align 2
_km_leave_2:
    KM_SAVE
    mov x0, #2
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- TouchMoved (RVA 0x9be64, plain) ----
.globl _km_tramp_3
.p2align 2
_km_tramp_3:
    KM_SAVE
    mov x0, #3
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0x5281fb68
    KM_JUMP_BASE_PLUS 0x9be68
.globl _km_leave_3
.p2align 2
_km_leave_3:
    KM_SAVE
    mov x0, #3
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- ButtonPressed (RVA 0x9be7c, plain) ----
.globl _km_tramp_4
.p2align 2
_km_tramp_4:
    KM_SAVE
    mov x0, #4
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd65f03c0
    KM_JUMP_BASE_PLUS 0x9be80
.globl _km_leave_4
.p2align 2
_km_leave_4:
    KM_SAVE
    mov x0, #4
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- SetTextGradient (RVA 0x95dec, plain) ----
.globl _km_tramp_5
.p2align 2
_km_tramp_5:
    KM_SAVE
    mov x0, #5
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd10103ff
    KM_JUMP_BASE_PLUS 0x95df0
.globl _km_leave_5
.p2align 2
_km_leave_5:
    KM_SAVE
    mov x0, #5
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- RefreshHeader (RVA 0xc8c40, plain) ----
.globl _km_tramp_6
.p2align 2
_km_tramp_6:
    KM_SAVE
    mov x0, #6
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd10143ff
    KM_JUMP_BASE_PLUS 0xc8c44
.globl _km_leave_6
.p2align 2
_km_leave_6:
    KM_SAVE
    mov x0, #6
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- ChatSender (RVA 0xd246c, bl) ----
.globl _km_tramp_7
.p2align 2
_km_tramp_7:
    KM_SAVE
    mov x0, #7
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    KM_BL_BASE_PLUS 0xdcfd88, 0xd2470
.globl _km_leave_7
.p2align 2
_km_leave_7:
    KM_SAVE
    mov x0, #7
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- AddInput (RVA 0x1db228, plain) ----
.globl _km_tramp_8
.p2align 2
_km_tramp_8:
    KM_SAVE
    mov x0, #8
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd101c3ff
    KM_JUMP_BASE_PLUS 0x1db22c
.globl _km_leave_8
.p2align 2
_km_leave_8:
    KM_SAVE
    mov x0, #8
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- FrameHook (RVA 0x223ea8, plain) ----
.globl _km_tramp_9
.p2align 2
_km_tramp_9:
    KM_SAVE
    mov x0, #9
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd10243ff
    KM_JUMP_BASE_PLUS 0x223eac
.globl _km_leave_9
.p2align 2
_km_leave_9:
    KM_SAVE
    mov x0, #9
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- HomeScreenInit (RVA 0x231ba4, plain) ----
.globl _km_tramp_10
.p2align 2
_km_tramp_10:
    KM_SAVE
    mov x0, #10
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xd10243ff
    KM_JUMP_BASE_PLUS 0x231ba8
.globl _km_leave_10
.p2align 2
_km_leave_10:
    KM_SAVE
    mov x0, #10
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- CalcScale (RVA 0x2343ac, plain) ----
.globl _km_tramp_11
.p2align 2
_km_tramp_11:
    KM_SAVE
    mov x0, #11
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0x6dba2beb
    KM_JUMP_BASE_PLUS 0x2343b0
.globl _km_leave_11
.p2align 2
_km_leave_11:
    KM_SAVE
    mov x0, #11
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- Predict (RVA 0x432508, plain) ----
.globl _km_tramp_12
.p2align 2
_km_tramp_12:
    KM_SAVE
    mov x0, #12
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xb9011401
    KM_JUMP_BASE_PLUS 0x43250c
.globl _km_leave_12
.p2align 2
_km_leave_12:
    KM_SAVE
    mov x0, #12
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- SetXY (RVA 0xbbfc7c, plain) ----
.globl _km_tramp_13
.p2align 2
_km_tramp_13:
    KM_SAVE
    mov x0, #13
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0xbd002000
    KM_JUMP_BASE_PLUS 0xbbfc80
.globl _km_leave_13
.p2align 2
_km_leave_13:
    KM_SAVE
    mov x0, #13
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- SpriteAddChild (RVA 0xbd2bec, plain) ----
.globl _km_tramp_14
.p2align 2
_km_tramp_14:
    KM_SAVE
    mov x0, #14
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    .inst 0x79409c02
    KM_JUMP_BASE_PLUS 0xbd2bf0
.globl _km_leave_14
.p2align 2
_km_leave_14:
    KM_SAVE
    mov x0, #14
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16

// ---- SetText (RVA 0xbef364, b) ----
.globl _km_tramp_15
.p2align 2
_km_tramp_15:
    KM_SAVE
    mov x0, #15
    mov x1, sp
    bl _kitmod_enter
    mov x16, x0
    KM_RESTORE
    mov x30, x16
    KM_JUMP_BASE_PLUS 0x11d1000
.globl _km_leave_15
.p2align 2
_km_leave_15:
    KM_SAVE
    mov x0, #15
    mov x1, sp
    bl _kitmod_leave
    mov x16, x0
    KM_RESTORE
    br x16
